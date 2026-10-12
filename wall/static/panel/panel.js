(function () {
  'use strict';
  // Never refresh the editor automatically: doing so could discard unsaved work.
  let dirty=false;
  const publishButtons=Array.from(document.querySelectorAll('[data-publish-button]'));
  const originalDisabled=publishButtons.map(button=>button.disabled);
  function markDirty(){
    dirty=true;
    document.querySelectorAll('[data-unsaved-note]').forEach(note=>{note.hidden=false;});
    publishButtons.forEach(button=>{button.disabled=true;});
  }
  document.querySelectorAll('[data-edit-form]').forEach(form=>{
    if(form.querySelector('.errorlist'))markDirty();
    form.addEventListener('input',markDirty);
    form.addEventListener('change',markDirty);
    form.addEventListener('submit',()=>{dirty=false;});
  });
  // A restored page must not keep the disabled state left by its old document.
  window.addEventListener('pageshow',event=>{
    if(!event.persisted)return;
    if(dirty)markDirty();
    else publishButtons.forEach((button,index)=>{button.disabled=originalDisabled[index];});
  });
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});

  const form=document.querySelector('[data-editor]'),data=document.getElementById('asset-choices');
  if(!form||!data)return;
  const assets=JSON.parse(data.textContent),isBirthday=form.dataset.editor==='birthday';
  const field=name=>form.elements.namedItem(name);
  const value=name=>field(name)?field(name).value:'';
  const preview=document.getElementById('asset-preview'),image=document.getElementById('selected-image');
  const video=document.getElementById('selected-video'),placeholder=document.getElementById('selected-empty');
  const result=document.getElementById('editor-result'),explanation=document.getElementById('editor-explanation');
  const descriptions={
    project:'Se agrupan hasta cuatro proyectos en una pantalla completa, cada uno con su foto, porcentaje y fecha. Si hay más, se muestran en el siguiente grupo. Los destacados van primero.',
    team:'Una escena completa presenta al área con su fotografía, título y mensaje. Puedes añadir hasta tres funciones separadas por comas. Sin foto se utiliza el fondo corporativo.',
    culture:'El nombre del valor y una breve explicación aparecen sobre la foto o el fondo corporativo. Utiliza los valores oficiales aprobados por la empresa.',
    field_event:'Muestra una actividad en campo con fotografía, fecha y lugar. Puede ser una actividad próxima o una realizada; usa las fechas de programación para decidir cuánto tiempo se muestra.',
    image:'La imagen ocupa el fondo del anuncio, con el título y texto encima. Puede recortarse para llenar el espacio: usa una foto horizontal y revisa el borrador.',
    video:'El MP4 aparece como otra escena a pantalla completa, según su orden. Se reproduce hasta terminar y después continúa el carrusel. No se corta por la duración de las imágenes.',
    message:'Se muestra una tarjeta de texto con tu título y mensaje. Este formato no utiliza una imagen.',
    event:'Se muestra una tarjeta con título, fecha y lugar, en una escena completa. Para una actividad con foto, elige Evento en campo.',
    recognition:'Se muestra una tarjeta de agradecimiento con tu título, mensaje y animación de reconocimiento. Este formato no utiliza una imagen.'
  };
  let lastSource='';
  function toggleField(name,show){
    const wrapper=form.querySelector('[data-field="'+name+'"]'),control=field(name);
    if(wrapper)wrapper.hidden=!show;
    if(control)control.disabled=!show;
  }
  function update(){
    const kind=isBirthday?'image':value('kind'),select=field(isBirthday?'photo':'asset');
    const usesImage=['image','project','team','culture','field_event'].includes(kind),mediaKind=kind==='video'?'video':'image';
    if(!isBirthday){
      explanation.textContent=descriptions[kind]||'';
      toggleField('asset',usesImage||kind==='video');
      toggleField('team_roles',kind==='team');
      ['event_at','location'].forEach(name=>toggleField(name,kind==='event'||kind==='field_event'));
      ['progress_percent','progress_as_of','featured'].forEach(name=>toggleField(name,kind==='project'));
      field('progress_as_of').required=kind==='project'&&value('progress_percent')!=='';
      toggleField('duration_seconds',kind!=='video');
      // Keep duration submitted for model validation even when a video ignores it.
      field('duration_seconds').disabled=false;
      if(kind==='video')field('duration_seconds').value=16;
      Array.from(select.options).forEach(option=>{
        const asset=assets.find(item=>item.id===option.value);
        option.hidden=!!asset&&asset.kind!==mediaKind;
        option.disabled=option.hidden;
      });
      if(select.selectedOptions.length&&select.selectedOptions[0].disabled)select.value='';
      field('event_at').required=kind==='event'||kind==='field_event';
      select.required=kind==='image'||kind==='video';
    }
    const selected=assets.find(item=>item.id===select.value);
    const chosen=selected&&selected.kind===mediaKind&&!select.disabled?selected:null;
    const source=chosen?chosen.url:'';
    if(source!==lastSource){
      image.hidden=true;video.hidden=true;image.removeAttribute('src');
      video.pause();video.removeAttribute('src');video.load();
      if(chosen&&chosen.kind==='image'){image.src=source;image.hidden=false;}
      else if(chosen&&chosen.kind==='video'){video.src=source;video.hidden=false;}
      lastSource=source;
    }
    placeholder.hidden=!!chosen;
    placeholder.textContent=isBirthday?'Sin foto: se usarán sus iniciales':kind==='image'||kind==='video'?'Selecciona un archivo de Biblioteca':usesImage?'Sin foto: fondo corporativo':'Tarjeta de texto';
    preview.hidden=false;
    document.getElementById('selected-title').textContent=value(isBirthday?'name':'title')||'Tu contenido';
    document.getElementById('selected-copy').textContent=value(isBirthday?'greeting':'body')||(isBirthday?'Sin dedicatoria: se usará la felicitación del equipo.':'');
    const report=document.getElementById('selected-project-report');
    if(report){
      report.hidden=kind!=='project';
      report.textContent=value('progress_percent')===''?'Sin avance reportado':value('progress_percent')+'% · Reporte: '+(value('progress_as_of')||'completa la fecha');
    }
    let note;
    if(!field('enabled').checked)note='Excluido: se guardará en el borrador, pero no se incluirá al publicar.';
    else if(isBirthday){
      const day=value('day'),month=field('month').selectedOptions[0];
      note=day&&month?'Al publicar: la tarjeta se mostrará cada año el '+day+' de '+month.textContent.toLowerCase()+', según la hora de Lima.':'Completa el día y mes para programar su celebración anual.';
    }else{
      const start=value('starts_at'),end=value('ends_at');
      note=start?'Al publicar: esperará hasta '+start.replace('T',' a las ')+'.':'Al publicar: quedará disponible en la programación.';
      if(end)note+=' Se retirará el '+end.replace('T',' a las ')+'.';
      note+=' Horario de Lima.';
    }
    result.textContent=note;
  }
  form.addEventListener('input',update);form.addEventListener('change',update);update();
})();
