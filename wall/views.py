import re
from functools import wraps
from django.contrib import messages
from django.contrib.auth.decorators import login_required, permission_required
from django.core.exceptions import ValidationError
from django.db import transaction
from django.http import FileResponse, Http404, HttpResponse, JsonResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_POST, require_safe
from .forms import AssetForm, BirthdayForm, ContentForm, DisplayForm, WallForm
from .models import Asset, Birthday, Content, Display, Wall, display_token
from .services import birthday_snapshot, check_revision, get_wall, manifest, publish, published_manifest, snapshot


def access(permission='edit_wall'):
    def decorate(view):
        return login_required(permission_required('wall.'+permission, raise_exception=True)(view))
    return decorate


@access()
@never_cache
def dashboard(request):
    wall = get_wall()
    form = WallForm(instance=wall,initial={'revision':wall.revision})
    if request.method == 'POST':
        with transaction.atomic():
            wall = Wall.objects.select_for_update().get(pk=wall.pk)
            form = WallForm(request.POST,instance=wall)
            if form.is_valid():
                try:
                    check_revision(wall,form.cleaned_data['revision'])
                    form.save()
                    wall.revision += 1
                    wall.save(update_fields=['revision'])
                    messages.success(request,'Borrador guardado. Las pantallas conservan la versión publicada.')
                    return redirect('dashboard')
                except ValidationError as error:
                    form.add_error(None,error)
    # Compare the saved draft, including after restoring a historical publication.
    saved_wall = get_wall()
    publication = saved_wall.current_publication
    try:
        data,_ = snapshot(saved_wall)
        draft_matches_live = bool(publication and data == publication.snapshot)
        draft_error = ''
    except ValidationError as error:
        draft_matches_live, draft_error = False, ' '.join(error.messages)
    return render(request,'wall/dashboard.html',{
        'wall':saved_wall,'form':form,'contents':saved_wall.contents.select_related('asset'),
        'birthdays':saved_wall.birthdays.select_related('photo'),
        'content_count':saved_wall.contents.filter(enabled=True).count(),
        'birthday_count':saved_wall.birthdays.filter(enabled=True).count(),
        'draft_matches_live':draft_matches_live,'draft_error':draft_error,
    })


@access()
def content_edit(request, pk=None):
    return edit_entry(request,Content,ContentForm,'Contenido',pk)


@access()
def birthday_edit(request, pk=None):
    return edit_entry(request,Birthday,BirthdayForm,'Cumpleaños',pk)


@access()
@require_safe
@never_cache
def birthday_preview(request, pk):
    try:
        initial = birthday_preview_data(pk)
    except ValidationError as error:
        messages.error(request,' '.join(error.messages))
        return redirect('birthday_edit',pk=pk)
    return render(request,'wall/player.html',{'bootstrap':{'manifest':initial,'poll_url':reverse('birthday_preview_manifest',args=[pk])}})


def birthday_preview_data(pk):
    wall = get_wall()
    birthday = get_object_or_404(Birthday.objects.select_related('photo'),pk=pk,wall=wall)
    person = birthday_snapshot(birthday)
    data = {'config':{'name':wall.name,'ticker':'Celebramos contigo.',
                     'interval_minutes':15,'videos_per_turn':'all','quiz_enabled':False,'qr_enabled':False},
            'contents':[],'birthdays':[person],'music_id':None}
    initial = manifest(data,f'draft-{wall.revision}',lambda asset:reverse('editor_media',args=[asset]),preview=True)
    # Preview this card regardless of the date; never modify or publish the record.
    initial['birthdays'][0].update(is_today=True,days_until=0)
    return initial


@access()
@require_safe
@never_cache
def birthday_preview_manifest(request, pk):
    try:
        return manifest_response(request,birthday_preview_data(pk))
    except ValidationError as error:
        return JsonResponse({'error':' '.join(error.messages)},status=422)


def asset_choices():
    return [{'id':str(asset.pk),'title':asset.title,'kind':asset.kind,
             'url':reverse('editor_media',args=[asset.pk])} for asset in Asset.objects.all()]


def edit_entry(request, model, form_class, title, pk):
    wall = get_wall()
    entry = get_object_or_404(model,pk=pk,wall=wall) if pk else model(wall=wall)
    initial = {'revision':wall.revision}
    # Library shortcuts only preselect an existing, compatible asset; GET never saves.
    if not pk and request.GET.get('asset'):
        try:
            asset = Asset.objects.get(pk=request.GET['asset'])
        except (Asset.DoesNotExist,ValidationError):
            asset = None
        if asset and model is Birthday and asset.kind == 'image':
            initial['photo'] = asset.pk
        elif asset and model is Content and asset.kind in ('image','video'):
            initial.update(asset=asset.pk,kind=asset.kind,title=asset.title)
    form = form_class(instance=entry,initial=initial)
    if request.method == 'POST':
        with transaction.atomic():
            wall = Wall.objects.select_for_update().get(pk=wall.pk)
            entry = get_object_or_404(model,pk=pk,wall=wall) if pk else model(wall=wall)
            form = form_class(request.POST,instance=entry)
            if form.is_valid():
                try:
                    check_revision(wall,form.cleaned_data['revision'])
                    form.save()
                    wall.revision += 1
                    wall.save(update_fields=['revision'])
                    messages.success(request,'Guardado en el borrador. Revisa la vista previa y publica para enviarlo a las pantallas.')
                    return redirect('dashboard')
                except ValidationError as error:
                    form.add_error(None,error)
    return render(request,'wall/form.html',{'form':form,'title':title,'is_birthday':model is Birthday,
                  'entry':entry,'asset_choices':asset_choices(),
                  'caption':'Completa los pasos, guarda el borrador y revisa el resultado antes de publicar.'})


@access()
@require_POST
def delete_entry(request, kind, pk):
    model = {'content':Content,'birthday':Birthday}.get(kind)
    if model is None:
        raise Http404
    with transaction.atomic():
        wall = Wall.objects.select_for_update().get(pk=1)
        try:
            check_revision(wall,request.POST.get('revision'))
            get_object_or_404(model,pk=pk,wall=wall).delete()
            wall.revision += 1
            wall.save(update_fields=['revision'])
            messages.success(request,'Retirado del borrador. Publica para actualizar las pantallas.')
        except ValidationError as error:
            messages.error(request,error.messages[0])
    return redirect('dashboard')


@access()
@never_cache
def library(request):
    form = AssetForm(request.POST or None,request.FILES or None)
    if request.method == 'POST' and form.is_valid():
        data = form.cleaned_data
        Asset.objects.create(title=data['title'],kind=data['kind'],file=data['file'],size=data['file'].size,content_type=data['content_type'],created_by=request.user)
        messages.success(request,'Archivo guardado. Ya puedes seleccionarlo en un contenido del borrador.')
        return redirect('library')
    return render(request,'wall/library.html',{'form':form,'assets':Asset.objects.all()})


@access('publish_wall')
@require_POST
def publish_draft(request):
    try:
        publication = publish(request.user,request.POST.get('revision'))
        messages.success(request,f'Versión {publication.number} publicada. Las TVs la recibirán y aplicarán al terminar una escena o video.')
    except ValidationError as error:
        messages.error(request,' '.join(error.messages))
    return redirect('dashboard')


@access()
@never_cache
def history(request):
    wall = get_wall()
    return render(request,'wall/history.html',{'wall':wall,'publications':wall.publications.select_related('published_by','restored_from')})


@access('publish_wall')
@require_POST
def restore(request, pk):
    wall = get_wall()
    get_object_or_404(wall.publications,pk=pk)
    try:
        publication = publish(request.user,request.POST.get('revision'),restore=pk)
        messages.success(request,f'Contenido anterior recuperado como versión {publication.number}. Tu borrador no ha cambiado.')
    except ValidationError as error:
        messages.error(request,error.messages[0])
    return redirect('history')


@access('manage_displays')
@never_cache
def displays(request):
    wall = get_wall()
    form = DisplayForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        item = form.save(commit=False)
        item.wall = wall
        item.save()
        messages.success(request,'Pantalla creada. Abre su enlace en la TV.')
        return redirect('displays')
    items = list(wall.displays.all())
    for item in items:
        item.view_url = request.build_absolute_uri(reverse('tv',args=[item.token]))
    return render(request,'wall/displays.html',{'form':form,'displays':items})


@access('manage_displays')
@require_POST
def display_action(request, pk):
    item = get_object_or_404(Display,pk=pk,wall=get_wall())
    if request.POST.get('action') == 'rotate':
        item.token = display_token()
        messages.success(request,'Enlace renovado. Abre el nuevo enlace en la TV.')
    else:
        item.active = not item.active
    item.save()
    return redirect('displays')


@access()
@require_safe
@never_cache
def preview(request):
    try:
        initial = draft_manifest()
    except ValidationError as error:
        messages.error(request,' '.join(error.messages))
        return redirect('dashboard')
    return render(request,'wall/player.html',{'bootstrap':{'manifest':initial,'poll_url':reverse('preview_manifest')}})


def draft_manifest():
    wall = get_wall()
    data,_ = snapshot(wall)
    return manifest(data,f'draft-{wall.revision}',lambda asset:reverse('editor_media',args=[asset]),preview=True)


@access()
@require_safe
@never_cache
def preview_manifest(request):
    try:
        return manifest_response(request,draft_manifest())
    except ValidationError as error:
        return JsonResponse({'error':' '.join(error.messages)},status=422)


def editor_published_manifest():
    publication = get_wall().current_publication
    if not publication:
        return {'version':0,'signature':'unpublished','config':{},'contents':[],'birthdays':[],'music_url':None,'preview':False}
    return manifest(publication.snapshot,publication.number,lambda asset:reverse('editor_media',args=[asset]))


@access()
@require_safe
@never_cache
def published_preview(request):
    return render(request,'wall/player.html',{'bootstrap':{'manifest':editor_published_manifest(),
                  'poll_url':reverse('published_preview_manifest')}})


@access()
@require_safe
@never_cache
def published_preview_manifest(request):
    return manifest_response(request,editor_published_manifest())


def manifest_response(request, data):
    etag = '"'+data['signature']+'"'
    response = HttpResponse(status=304) if request.headers.get('If-None-Match') == etag else JsonResponse(data)
    response['ETag'] = etag
    return response


def active_display(token):
    return get_object_or_404(Display.objects.select_related('wall__current_publication'),token=token,active=True)


@require_safe
@never_cache
def tv(request, token):
    display = active_display(token)
    return render(request,'wall/player.html',{'bootstrap':{'manifest':published_manifest(display),'poll_url':reverse('tv_manifest',args=[token])}})


@require_safe
@never_cache
def tv_manifest(request, token):
    return manifest_response(request,published_manifest(active_display(token)))


@access()
@require_safe
def editor_media(request, asset_id):
    return media_response(request,get_object_or_404(Asset,pk=asset_id))


@require_safe
def tv_media(request, token, asset_id):
    display = active_display(token)
    # Historical published assets remain playable while a screen finishes a clip.
    asset = get_object_or_404(Asset.objects.filter(publications__wall=display.wall).distinct(),pk=asset_id)
    return media_response(request,asset)


def media_response(request, asset):
    try:
        size = asset.file.size
    except (FileNotFoundError,OSError):
        raise Http404('Archivo no disponible')
    start, end, status = 0, size-1, 200
    header = request.headers.get('Range')
    if header:
        match = re.fullmatch(r'bytes=(\d*)-(\d*)',header)
        if not match or not any(match.groups()):
            response = HttpResponse(status=416)
            response['Content-Range'] = f'bytes */{size}'
            return response
        lower, upper = match.groups()
        if lower:
            start = int(lower)
            end = min(int(upper),size-1) if upper else size-1
        else:
            start = max(0,size-int(upper))
        if start >= size or end < start:
            response = HttpResponse(status=416)
            response['Content-Range'] = f'bytes */{size}'
            return response
        status = 206
    length = end-start+1
    if request.method == 'HEAD':
        response = HttpResponse(status=status,content_type=asset.content_type)
    else:
        try:
            handle = asset.file.open('rb')
        except (FileNotFoundError,OSError):
            raise Http404
        if status == 200:
            response = FileResponse(handle,content_type=asset.content_type)
        else:
            def chunks():
                try:
                    handle.seek(start)
                    remaining = length
                    while remaining:
                        chunk = handle.read(min(65536,remaining))
                        if not chunk:
                            break
                        remaining -= len(chunk)
                        yield chunk
                finally:
                    handle.close()
            response = StreamingHttpResponse(chunks(),status=206,content_type=asset.content_type)
    response['Content-Length'] = str(length)
    response['Accept-Ranges'] = 'bytes'
    response['Cache-Control'] = 'private, no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    if status == 206:
        response['Content-Range'] = f'bytes {start}-{end}/{size}'
    return response
