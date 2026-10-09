import copy
import hashlib
import json
from datetime import date
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Max
from django.urls import reverse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from .models import Publication, Wall


def get_wall():
    return Wall.objects.get_or_create(pk=1)[0]


def check_revision(wall, expected):
    if str(wall.revision) != str(expected):
        raise ValidationError('Otra persona guardó cambios. Recarga la página antes de continuar.')


def snapshot(wall):
    wall.full_clean()
    posts, assets = [], set()
    for item in wall.contents.filter(enabled=True).select_related('asset'):
        item.full_clean()
        if item.asset_id:
            if not item.asset.file.storage.exists(item.asset.file.name):
                raise ValidationError('Falta el archivo de «'+item.title+'». Revisa la biblioteca antes de publicar.')
            assets.add(str(item.asset_id))
        posts.append({'id':item.pk,'kind':item.kind,'title':item.title,'body':item.body,'asset_id':str(item.asset_id) if item.asset_id else None,'event_at':item.event_at.isoformat() if item.event_at else None,'location':item.location,'duration':item.duration_seconds,'starts_at':item.starts_at.isoformat() if item.starts_at else None,'ends_at':item.ends_at.isoformat() if item.ends_at else None})
    birthdays = []
    for birthday in wall.birthdays.filter(enabled=True):
        birthday.full_clean()
        birthdays.append({'id':birthday.pk,'name':birthday.name,'department':birthday.department,'day':birthday.day,'month':birthday.month})
    if wall.music_id:
        if not wall.music.file.storage.exists(wall.music.file.name):
            raise ValidationError('No está disponible el archivo de música seleccionado.')
        assets.add(str(wall.music_id))
    return {'config':{key:getattr(wall,key) for key in ['name','welcome_title','welcome_body','ticker','interval_minutes','videos_per_turn','quiz_enabled','qr_enabled']},'music_id':str(wall.music_id) if wall.music_id else None,'contents':posts,'birthdays':birthdays}, assets


@transaction.atomic
def publish(user, expected_revision, restore=None):
    wall = Wall.objects.select_for_update().get(pk=1)
    check_revision(wall, expected_revision)
    if restore:
        previous = wall.publications.get(pk=restore)
        data, asset_ids = copy.deepcopy(previous.snapshot), list(previous.assets.values_list('pk',flat=True))
    else:
        previous = None
        data, asset_ids = snapshot(wall)
    # A restored live version leaves the current draft untouched.
    latest = wall.publications.aggregate(n=Max('number'))['n'] or 0
    item = Publication.objects.create(wall=wall,number=latest+1,draft_revision=wall.revision,snapshot=data,published_by=user,restored_from=previous)
    item.assets.set(asset_ids)
    wall.current_publication = item
    wall.save(update_fields=['current_publication'])
    return item


def manifest(data, version, media_url, preview=False, now=None):
    now = now or timezone.now()
    today = timezone.localtime(now).date()
    resolved = copy.deepcopy(data)
    active = []
    for item in resolved['contents']:
        start = parse_datetime(item['starts_at']) if item['starts_at'] else None
        end = parse_datetime(item['ends_at']) if item['ends_at'] else None
        if (start and now < start) or (end and now >= end):
            continue
        item['url'] = media_url(item['asset_id']) if item['asset_id'] else None
        active.append(item)
    resolved['contents'] = active
    for birthday in resolved['birthdays']:
        birthday['is_today'] = (birthday['month'],birthday['day']) == (today.month,today.day)
        for year in range(today.year,today.year+9):
            try:
                next_date = date(year,birthday['month'],birthday['day'])
                if next_date >= today:
                    birthday['days_until'] = (next_date-today).days
                    break
            except ValueError:
                continue
    resolved['birthdays'].sort(key=lambda x:(x['days_until'],x['name']))
    resolved['music_url'] = media_url(resolved['music_id']) if resolved['music_id'] else None
    resolved.update(version=version,preview=preview,server_time=now.isoformat())
    # Changes in scheduling or local date must also propagate without a new publish.
    signature = json.dumps([version,today.isoformat(),active,resolved['birthdays'],resolved['config'],resolved['music_url']],sort_keys=True)
    resolved['signature'] = hashlib.sha256(signature.encode()).hexdigest()
    return resolved


def published_manifest(display):
    publication = display.wall.current_publication
    if not publication:
        return {'version':0,'signature':'unpublished','config':{},'contents':[],'birthdays':[],'music_url':None,'preview':False}
    return manifest(publication.snapshot, publication.number, lambda asset:reverse('tv_media',args=[display.token,asset]))
