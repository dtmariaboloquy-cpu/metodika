(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FixtureCordobeses = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function hashPartido(texto) {
    let h1 = 2166136261, h2 = 5381;
    for (let i = 0; i < texto.length; i++) {
      const c = texto.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619);
      h2 = Math.imul(h2, 33) ^ c;
    }
    return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
  }

  function clavePartido(zonaIdx, local, visitante) {
    const equipos = [local, visitante].sort((a, b) => a.localeCompare(b));
    return "z" + zonaIdx + "-m" + hashPartido(equipos.join("\u0000"));
  }

  function rondasTodosContraTodos(equipos) {
    const participantes = equipos.slice();
    if (participantes.length % 2) participantes.push(null);
    if (participantes.length < 2) return [];
    const rondas = [];
    for (let ronda = 0; ronda < participantes.length - 1; ronda++) {
      const partidos = [];
      for (let i = 0; i < participantes.length / 2; i++) {
        const a = participantes[i], b = participantes[participantes.length - 1 - i];
        if (a && b) partidos.push(ronda % 2 ? [b, a] : [a, b]);
      }
      rondas.push(partidos);
      participantes.splice(1, 0, participantes.pop());
    }
    return rondas;
  }

  function partidosDeZona(equipos, zonaIdx, numZonas, numCanchas, formato) {
    const canchasPorZona = Math.max(1, Math.floor(numCanchas / numZonas));
    let rondas = rondasTodosContraTodos(equipos);
    if (formato === "dos" && equipos.length >= 3) {
      const permitidos = new Set();
      equipos.forEach((equipo, i) => permitidos.add(clavePartido(zonaIdx, equipo, equipos[(i + 1) % equipos.length])));
      rondas = rondas.map((ronda) => ronda.filter(([a, b]) => permitidos.has(clavePartido(zonaIdx, a, b))));
    }
    const partidos = [];
    rondas.forEach((ronda, rondaIdx) => ronda.forEach(([local, visitante], partidoIdx) => partidos.push({
      local, visitante, ronda: rondaIdx + 1,
      cancha: ((zonaIdx * canchasPorZona + partidoIdx) % numCanchas) + 1,
      key: clavePartido(zonaIdx, local, visitante),
      legacyKey: zonaIdx + "|" + local + "|" + visitante,
      legacyReverseKey: zonaIdx + "|" + visitante + "|" + local,
    })));
    return partidos;
  }

  // Nombre "base" del colegio: le saca la letra final de variante (" A", " B", " C"...)
  // salvo que sea un equipo combinado tipo "Colegio X A y B" (ahí se deja como está).
  function institucionBase(nombre) {
    const limpio = String(nombre || "").trim();
    const variante = limpio.match(/^(.*)\s+([A-Za-z])$/);
    const base = variante && !/\s+y$/i.test(variante[1]) ? variante[1] : limpio;
    return base.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function mezclar(lista, aleatorio) {
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(aleatorio() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  // Arma el orden de sorteo de forma que, al repartir por posición (i % numZonas),
  // los equipos del mismo colegio queden en zonas distintas siempre que sea posible.
  function distribuirSinMismaInstitucion(equipos, numZonas, aleatorio) {
    const azar = typeof aleatorio === "function" ? aleatorio : Math.random;
    const lista = Array.isArray(equipos) ? equipos.filter(Boolean) : [];
    const zonasCantidad = Math.max(1, parseInt(numZonas) || 1);
    const total = lista.length;
    if (total === 0) return [];

    // Los primeros (total % zonasCantidad) zonas reciben un equipo extra: son las
    // zonas "grandes". Este orden decreciente es clave para que después, al
    // intercalar por fila, la posición i quede siempre en la zona i % zonasCantidad.
    const capacidad = Array.from({ length: zonasCantidad }, (_, i) =>
      Math.floor(total / zonasCantidad) + (i < total % zonasCantidad ? 1 : 0)
    );

    const gruposMapa = new Map();
    mezclar(lista, azar).forEach((equipo) => {
      const base = institucionBase(equipo);
      if (!gruposMapa.has(base)) gruposMapa.set(base, []);
      gruposMapa.get(base).push(equipo);
    });
    // Los colegios con más equipos se ubican primero: son los que más chocan si
    // se dejan para el final, cuando ya quedan pocas zonas con lugar.
    const grupos = mezclar(Array.from(gruposMapa.values()), azar).sort((a, b) => b.length - a.length);

    const zonas = Array.from({ length: zonasCantidad }, () => []);
    grupos.forEach((grupo) => {
      const usadas = new Set();
      mezclar(grupo, azar).forEach((equipo) => {
        const candidatas = (evitarUsadas) => zonas
          .map((z, i) => ({ i, ocupacion: capacidad[i] ? z.length / capacidad[i] : 1, libre: z.length < capacidad[i] }))
          .filter((z) => z.libre && (!evitarUsadas || !usadas.has(z.i)));
        let opciones = candidatas(true);
        // Si el colegio ya tiene un equipo en cada zona con lugar, se reinicia:
        // el resto de sus equipos también intenta repartirse lo más parejo posible.
        if (opciones.length === 0) { usadas.clear(); opciones = candidatas(false); }
        if (opciones.length === 0) opciones = zonas.map((z, i) => ({ i, ocupacion: z.length }));
        opciones.sort((a, b) => a.ocupacion - b.ocupacion || a.i - b.i);
        const zi = opciones[0].i;
        zonas[zi].push(equipo);
        usadas.add(zi);
      });
    });

    const filas = capacidad.reduce((max, c) => Math.max(max, c), 0);
    const orden = [];
    for (let fila = 0; fila < filas; fila++) {
      for (let zi = 0; zi < zonasCantidad; zi++) {
        if (zonas[zi][fila] !== undefined) orden.push(zonas[zi][fila]);
      }
    }
    return orden;
  }

  return { clavePartido, rondasTodosContraTodos, partidosDeZona, institucionBase, distribuirSinMismaInstitucion, mezclar };
});


(function(root){
  if(!root||typeof root.fetch!=="function"||!root.location)return;
  const original=root.fetch.bind(root),colas={};
  root.fetch=function(input,options){
    const url=typeof input==="string"?input:(input&&input.url)||"";
    const metodo=((options&&options.method)||"GET").toUpperCase();
    const m=url.match(/^(.*\/panelCordobeses\/jornadas\/([^/]+)\/resultados)\/([^/]+)\/(gl|gv|pl|pv)\.json(\?[^#]*)?$/);
    if(metodo!=="PUT"||!m)return original(input,options);
    const id=m[2],key=decodeURIComponent(m[3]),campo=m[4],base=m[1]+".json"+(m[5]||"");
    const valor=options&&options.body!==undefined?JSON.parse(options.body):"";
    const guardado=(colas[id]||Promise.resolve()).catch(()=>{}).then(async()=>{
      const lectura=await original(base);
      if(!lectura.ok)return lectura;
      const resultados=(await lectura.json())||{};
      resultados[key]={...(resultados[key]||{}),[campo]:valor};
      return original(base,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(resultados)});
    });
    colas[id]=guardado;
    return guardado;
  };
})(typeof globalThis!=="undefined"?globalThis:this);


(function(root){
  if(!root||!root.document||typeof root.fetch!=="function")return;
  const anterior=root.fetch.bind(root),cache={},cargando={},DB="https://metodika-dt-multijugador-default-rtdb.firebaseio.com";
  let auth="";
  root.fetch=function(input,options){
    const url=typeof input==="string"?input:(input&&input.url)||"",m=url.match(/[?&]auth=([^&]+)/);
    if(m)auth=m[1];
    return anterior(input,options);
  };
  function valor(r,c){return r&&r[c]!==undefined?r[c]:""}
  function ganador(a,b,r){
    if(!a||!b||valor(r,"gl")===""||valor(r,"gv")==="")return null;
    const gl=Number(r.gl),gv=Number(r.gv); if(gl>gv)return a;if(gv>gl)return b;
    if(valor(r,"pl")===""||valor(r,"pv")==="")return null;
    const pl=Number(r.pl),pv=Number(r.pv);return pl===pv?null:(pl>pv?a:b);
  }
  function editable(input,card){for(let e=input;e&&e!==card;e=e.parentElement)if(getComputedStyle(e).pointerEvents==="none")return false;return true}
  async function cargar(id){
    if(!auth||cache[id]||cargando[id])return;
    cargando[id]=true;
    try{const r=await anterior(DB+"/panelCordobeses/jornadas/"+id+"/resultados.json?auth="+auth);if(r.ok)cache[id]=(await r.json())||{};}finally{cargando[id]=false;}
  }
  function guardar(id,key,campo,dato){
    cache[id]=cache[id]||{};cache[id][key]={...(cache[id][key]||{}),[campo]:dato};
    return anterior(DB+"/panelCordobeses/jornadas/"+id+"/resultados/"+key+"/"+campo+".json?auth="+auth,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(dato)});
  }
  function partido(id,key,titulo,a,b,puedeEditar){
    const r=(cache[id]&&cache[id][key])||{},g=ganador(a,b,r),caja=document.createElement("div");
    caja.style.cssText="background:#fff;border:1px solid #dfe3e8;border-radius:8px;padding:10px";
    const head=document.createElement("div");head.textContent=titulo;head.style.cssText="font-size:10px;font-weight:800;color:#17365d;margin-bottom:7px";caja.appendChild(head);
    if(!a||!b){const espera=document.createElement("div");espera.textContent="Esperando ganadores…";espera.style.cssText="font-size:11px;color:#596579;padding:5px";caja.appendChild(espera);return caja;}
    [[a,"gl"],[b,"gv"]].forEach(([eq,campo])=>{const fila=document.createElement("div");fila.style.cssText="display:grid;grid-template-columns:1fr 38px;gap:6px;align-items:center;margin:4px 0;font-size:11px";const nombre=document.createElement("div");nombre.textContent=eq+(g===eq?" · GANADOR":"");nombre.style.cssText="font-weight:"+(g===eq?"800":"500")+";color:"+(g===eq?"#168753":"#17213a");const inp=document.createElement("input");inp.type="number";inp.min="0";inp.value=valor(r,campo);inp.disabled=!puedeEditar;inp.style.cssText="width:38px;text-align:center;border:1px solid #cfd5dd;border-radius:4px";inp.onchange=()=>guardar(id,key,campo,inp.value);fila.append(nombre,inp);caja.appendChild(fila);});
    if(valor(r,"gl")!==""&&valor(r,"gv")!==""&&Number(r.gl)===Number(r.gv)){const pen=document.createElement("div");pen.style.cssText="display:flex;gap:6px;align-items:center;margin-top:8px;padding-top:8px;border-top:1px dashed #cfd5dd;font-size:10px;color:#596579";const txt=document.createElement("strong");txt.textContent="PENALES";pen.appendChild(txt);["pl","pv"].forEach((campo,i)=>{if(i){const guion=document.createElement("span");guion.textContent="-";pen.appendChild(guion)}const inp=document.createElement("input");inp.type="number";inp.min="0";inp.value=valor(r,campo);inp.disabled=!puedeEditar;inp.style.cssText="width:38px;text-align:center";inp.onchange=()=>guardar(id,key,campo,inp.value);pen.appendChild(inp)});caja.appendChild(pen)}
    return caja;
  }
  function equipoStats(fila){
    if(!fila)return null;
    const c=fila.cells;
    return{nombre:c[0].childNodes[0].textContent.trim(),pts:Number(c[8].textContent)||0,dg:Number(c[7].textContent)||0,gf:Number(c[5].textContent)||0};
  }
  function construirRankingSegundos(ordenados){
    const caja=document.createElement("div");
    caja.style.cssText="background:#fff;border:1px solid #dfe3e8;border-radius:8px;padding:10px;grid-column:1/-1";
    const head=document.createElement("div");head.textContent="RANKING DE PERDEDORES DE FINAL DE ZONA · define al 4º";head.style.cssText="font-size:10px;font-weight:800;color:#17365d;margin-bottom:7px";caja.appendChild(head);
    ordenados.forEach((o,i)=>{
      const fila=document.createElement("div");
      fila.style.cssText="display:flex;justify-content:space-between;gap:8px;font-size:11px;margin:4px 0;padding:4px 0;"+(i<2?"font-weight:800;color:#168753":"color:#8792a2;text-decoration:line-through");
      const izq=document.createElement("span");izq.textContent=(i+1)+"º · "+o.equipo+" (ZONA "+(o.zona+1)+")"+(i<2?" · avanza al cruce":" · queda eliminado");
      const der=document.createElement("span");der.textContent=o.stats.pts+"pts · DG "+o.stats.dg+" · "+o.stats.gf+"GF";
      fila.append(izq,der);caja.appendChild(fila);
    });
    return caja;
  }
  function montar(){
    document.querySelectorAll("[data-jornada-id]").forEach(card=>{
      const id=card.dataset.jornadaId,rotulos=Array.from(card.querySelectorAll("div")).filter(e=>e.children.length===0&&/^ZONA \d+ \(\d+\)$/.test(e.textContent.trim()));
      const numZonas=rotulos.length;
      if(numZonas!==2&&numZonas!==3&&numZonas!==4){const vieja=card.querySelector(".fase-final-automatica");if(vieja)vieja.remove();return;}
      cargar(id);
      const zonas=rotulos.map(r=>r.parentElement),clasificados=[],completas=[],filasZona=[];
      zonas.forEach(z=>{const entradas=Array.from(z.querySelectorAll('input[type="number"]')),completa=entradas.length>0&&entradas.every(i=>i.value!=="");completas.push(completa);const filas=Array.from(z.querySelectorAll("tbody tr"));filasZona.push(filas);const fila=filas[0];if(fila){fila.style.background=completa?"#dff3e7":"transparent";let badge=fila.querySelector(".badge-clasifica");if(completa&&!badge){badge=document.createElement("strong");badge.className="badge-clasifica";badge.textContent=" · CLASIFICA";badge.style.color="#168753";fila.cells[0].appendChild(badge)}if(!completa&&badge)badge.remove();clasificados.push(completa?fila.cells[0].childNodes[0].textContent.trim():null)}else clasificados.push(null)});
      const titulo=Array.from(card.querySelectorAll("div")).find(e=>e.children.length===0&&e.textContent.trim()==="Armar cruces (sorteo) y resultados"),contenedor=titulo&&titulo.parentElement;if(!contenedor)return;
      const datos=cache[id]||{};
      let fase=contenedor.querySelector(".fase-final-automatica");
      const firma=JSON.stringify([numZonas,clasificados,datos["fase-semi-1"],datos["fase-semi-2"],datos["fase-final"],datos["fase-zona-final-1"],datos["fase-zona-final-2"],datos["fase-zona-final-3"],datos["fase-repechaje"]]);
      if(fase&&fase.dataset.firma===firma)return;
      if(fase)fase.remove();
      fase=document.createElement("div");fase.className="fase-final-automatica";fase.dataset.firma=firma;fase.style.cssText="margin-top:14px;padding:12px;background:#f7f8fa;border:1px solid #dfe3e8;border-radius:9px";
      const h=document.createElement("div");h.textContent=numZonas===2?"FASE FINAL · FINAL":numZonas===3?"FASE FINAL · FINALES DE ZONA Y CRUCE POR EL 4º":"FASE FINAL · SEMIFINALES Y FINAL";h.style.cssText="font-size:12px;font-weight:900;color:#17365d;margin-bottom:10px";fase.appendChild(h);
      if(!completas.every(Boolean)){const aviso=document.createElement("div");aviso.textContent="Se habilita automáticamente cuando estén completos todos los resultados de las "+numZonas+" zonas.";aviso.style.cssText="font-size:11px;color:#596579";fase.appendChild(aviso);contenedor.appendChild(fase);return;}
      const baseInput=zonas[0].querySelector('input[type="number"]'),puede=baseInput&&editable(baseInput,card);
      const grid=document.createElement("div");grid.style.cssText="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px";
      let campeon=null,clasificadosFinales=null;
      if(numZonas===2){
        const rf=datos["fase-final"]||{};
        campeon=ganador(clasificados[0],clasificados[1],rf);
        grid.append(partido(id,"fase-final","FINAL · ZONA 1 vs ZONA 2",clasificados[0],clasificados[1],puede));
      } else if(numZonas===3){
        const segundos=filasZona.map(filas=>filas[1]?filas[1].cells[0].childNodes[0].textContent.trim():null);
        const finales=[0,1,2].map(zi=>{const rf=datos["fase-zona-final-"+(zi+1)]||{};return{zona:zi,primero:clasificados[zi],segundo:segundos[zi],ganador:ganador(clasificados[zi],segundos[zi],rf)}});
        finales.forEach(f=>grid.append(partido(id,"fase-zona-final-"+(f.zona+1),"FINAL ZONA "+(f.zona+1)+" · 1º vs 2º",f.primero,f.segundo,puede)));
        if(finales.every(f=>f.ganador)){
          const perdedores=finales.map(f=>{const perdioElPrimero=f.ganador===f.segundo;const stats=equipoStats(filasZona[f.zona][perdioElPrimero?0:1]);return{zona:f.zona,equipo:perdioElPrimero?f.primero:f.segundo,stats:stats||{pts:0,dg:0,gf:0}}});
          const ordenados=perdedores.slice().sort((a,b)=>b.stats.pts-a.stats.pts||b.stats.dg-a.stats.dg||b.stats.gf-a.stats.gf);
          grid.append(construirRankingSegundos(ordenados));
          const [mejor1,mejor2]=ordenados,rr=datos["fase-repechaje"]||{};
          grid.append(partido(id,"fase-repechaje","CRUCE POR EL 4º · Mejores perdedores de zona",mejor1.equipo,mejor2.equipo,puede));
          const cuarto=ganador(mejor1.equipo,mejor2.equipo,rr);
          if(cuarto)clasificadosFinales=[finales[0].ganador,finales[1].ganador,finales[2].ganador,cuarto];
        }
      } else {
        const r1=datos["fase-semi-1"]||{},r2=datos["fase-semi-2"]||{},g1=ganador(clasificados[0],clasificados[1],r1),g2=ganador(clasificados[2],clasificados[3],r2),rf=datos["fase-final"]||{};
        campeon=ganador(g1,g2,rf);
        grid.append(partido(id,"fase-semi-1","SEMIFINAL 1 · ZONA 1 vs ZONA 2",clasificados[0],clasificados[1],puede),partido(id,"fase-semi-2","SEMIFINAL 2 · ZONA 3 vs ZONA 4",clasificados[2],clasificados[3],puede),partido(id,"fase-final","FINAL",g1,g2,puede));
      }
      fase.appendChild(grid);
      if(campeon){const copa=document.createElement("div");copa.textContent="🏆 GANADOR: "+campeon;copa.style.cssText="margin-top:10px;padding:12px;background:#168753;color:#fff;border-radius:8px;text-align:center;font-weight:900";fase.appendChild(copa)}
      else if(clasificadosFinales){const copa=document.createElement("div");copa.textContent="🏆 CLASIFICADOS: "+clasificadosFinales.join(" · ");copa.style.cssText="margin-top:10px;padding:12px;background:#168753;color:#fff;border-radius:8px;text-align:center;font-weight:900";fase.appendChild(copa)}
      contenedor.appendChild(fase);
    });
  }
  setInterval(montar,800);setTimeout(montar,1000);
})(typeof globalThis!=="undefined"?globalThis:this);


(function(){
  function cerrar(){const viejo=document.getElementById("ganadores-cordobeses-overlay");if(viejo)viejo.remove()}
  function mostrar(titulo,ganadores){
    cerrar();const overlay=document.createElement("div");overlay.id="ganadores-cordobeses-overlay";overlay.style.cssText="position:fixed;inset:0;z-index:100000;background:#0008;display:flex;align-items:center;justify-content:center;padding:18px";const modal=document.createElement("div");modal.style.cssText="width:min(520px,100%);background:#fff;border-radius:12px;padding:18px;box-shadow:0 16px 45px #0005";const cab=document.createElement("div");cab.style.cssText="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:14px";const h=document.createElement("div");h.textContent=titulo;h.style.cssText="font-size:16px;font-weight:900;color:#17365d";const x=document.createElement("button");x.textContent="✕";x.style.cssText="border:none;background:#eef1f5;border-radius:50%;width:30px;height:30px;cursor:pointer";x.onclick=cerrar;cab.append(h,x);modal.appendChild(cab);ganadores.forEach((g,i)=>{const fila=document.createElement("div");fila.style.cssText="padding:12px;margin-top:8px;border:1px solid #cfe8d8;background:#eff9f2;border-radius:8px";const zona=document.createElement("div");zona.textContent=ganadores.length===1?"GANADOR DE LA ZONA":"GANADOR ZONA "+(i+1);zona.style.cssText="font-size:9px;font-weight:900;color:#168753;letter-spacing:.7px";const nombre=document.createElement("div");nombre.textContent="🏆 "+g.equipo;nombre.style.cssText="font-size:14px;font-weight:900;color:#17213a;margin:4px 0";const datos=document.createElement("div");datos.textContent=g.pts+" puntos · DG "+g.dg+" · "+g.gf+" goles a favor · CLASIFICA";datos.style.cssText="font-size:11px;color:#596579";fila.append(zona,nombre,datos);modal.appendChild(fila)});overlay.appendChild(modal);overlay.onclick=e=>{if(e.target===overlay)cerrar()};document.body.appendChild(overlay);
  }
  function montar(){document.querySelectorAll("[data-jornada-id]").forEach(card=>{const titulos=Array.from(card.querySelectorAll("div")).filter(e=>e.children.length===0&&/^ZONA \d+ \(\d+\)$/.test(e.textContent.trim())),tituloFixture=Array.from(card.querySelectorAll("div")).find(e=>e.children.length===0&&e.textContent.trim()==="Armar cruces (sorteo) y resultados");if(!tituloFixture)return;const seccion=tituloFixture.parentElement;let boton=seccion.querySelector(".boton-ver-ganadores");if(!titulos.length){if(boton)boton.remove();return}const ganadores=[],completas=[];titulos.forEach(t=>{const zona=t.parentElement,entradas=Array.from(zona.querySelectorAll('input[type="number"]')),completa=entradas.length>0&&entradas.every(i=>i.value!=="");completas.push(completa);const fila=zona.querySelector("tbody tr");if(completa&&fila){const c=fila.cells;ganadores.push({equipo:c[0].childNodes[0].textContent.trim(),gf:c[5].textContent.trim(),dg:c[7].textContent.trim(),pts:c[8].textContent.trim()})}});if(!boton){boton=document.createElement("button");boton.className="boton-ver-ganadores";boton.style.cssText="margin:3px 0 10px;padding:8px 13px;border:1px solid #168753;border-radius:8px;background:#eff9f2;color:#168753;font-size:11px;font-weight:900;cursor:pointer";tituloFixture.insertAdjacentElement("afterend",boton)}const listo=completas.length>0&&completas.every(Boolean);boton.disabled=!listo;boton.style.opacity=listo?"1":".55";boton.style.cursor=listo?"pointer":"not-allowed";boton.textContent=listo?(ganadores.length===1?"🏆 Equipo ganador":"🏆 Equipos ganadores"):"🏆 Ganadores pendientes";boton.onclick=e=>{e.stopPropagation();if(listo)mostrar(ganadores.length===1?"Equipo ganador":"Equipos ganadores",ganadores)};});}
  setInterval(montar,800);setTimeout(montar,1000);
})();


(function(){
  function cargarScript(src,listo){return new Promise((resolve,reject)=>{if(listo())return resolve();const existente=document.querySelector('script[data-pdf-src="'+src+'"]');if(existente){existente.addEventListener("load",resolve,{once:true});existente.addEventListener("error",reject,{once:true});return}const s=document.createElement("script");s.src=src;s.dataset.pdfSrc=src;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)})}
  async function generar(card,boton){
    const textoAnterior=boton.textContent;boton.disabled=true;boton.textContent="Generando PDF…";
    try{
      await cargarScript("https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js",()=>typeof window.html2canvas==="function");
      await cargarScript("https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js",()=>!!window.jspdf);
      const copia=card.cloneNode(true);copia.querySelectorAll("button").forEach(e=>e.remove());copia.querySelectorAll("input,select,textarea").forEach(e=>{const valor=document.createElement("span");valor.textContent=e.tagName==="SELECT"?(e.options[e.selectedIndex]&&e.options[e.selectedIndex].text)||"":e.value||"—";valor.style.cssText="display:inline-block;min-width:24px;padding:2px 5px;border:1px solid #dfe3e8;border-radius:4px;background:#fff;color:#17213a";e.replaceWith(valor)});copia.querySelectorAll(".boton-ver-ganadores,.boton-descargar-pdf").forEach(e=>e.remove());copia.style.cssText+=";width:1050px;max-width:none;background:#fff;padding:18px;position:fixed;left:-20000px;top:0;z-index:-1";const encabezado=document.createElement("div");encabezado.style.cssText="font-family:Arial,sans-serif;border-bottom:3px solid #17365d;padding-bottom:10px;margin-bottom:14px";encabezado.innerHTML='<div style="font-size:22px;font-weight:900;color:#17365d">CORDOBESES JUEGAN 2026</div><div style="font-size:12px;color:#596579;margin-top:4px">Informe oficial de jornada · Cruces, resultados y posiciones</div><div style="font-size:10px;color:#596579;margin-top:3px">Actualizado: '+new Date().toLocaleString("es-AR")+'</div>';copia.insertBefore(encabezado,copia.firstChild);document.body.appendChild(copia);
      const canvas=await window.html2canvas(copia,{scale:1.35,backgroundColor:"#ffffff",useCORS:true,logging:false});copia.remove();const pdf=new window.jspdf.jsPDF({orientation:"portrait",unit:"mm",format:"a4",compress:true}),margen=8,ancho=194,alto=canvas.height*ancho/canvas.width,altoPagina=281,img=canvas.toDataURL("image/jpeg",.9);let desplazamiento=0,pagina=0;while(desplazamiento<alto){if(pagina++)pdf.addPage();pdf.addImage(img,"JPEG",margen,margen-desplazamiento,ancho,alto,undefined,"FAST");desplazamiento+=altoPagina}const lineas=(card.innerText||"").split("\n").filter(Boolean).slice(0,5),nombre=("Cordobeses_"+lineas.join("_")).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"_").replace(/_+/g,"_").slice(0,90)+".pdf";pdf.save(nombre);
    }catch(error){alert("No se pudo generar el PDF. Revisá la conexión e intentá nuevamente.");console.error(error)}finally{boton.disabled=false;boton.textContent=textoAnterior}
  }
  function montar(){document.querySelectorAll("[data-jornada-id]").forEach(card=>{const titulo=Array.from(card.querySelectorAll("div")).find(e=>e.children.length===0&&e.textContent.trim()==="Armar cruces (sorteo) y resultados");if(!titulo)return;const seccion=titulo.parentElement;if(seccion.querySelector(".boton-descargar-pdf"))return;const boton=document.createElement("button");boton.className="boton-descargar-pdf";boton.textContent="⬇ Descargar PDF de la fecha";boton.style.cssText="margin:3px 0 10px 8px;padding:8px 13px;border:1px solid #17365d;border-radius:8px;background:#fff;color:#17365d;font-size:11px;font-weight:900;cursor:pointer";boton.onclick=e=>{e.stopPropagation();generar(card,boton)};titulo.insertAdjacentElement("afterend",boton)});}
  setInterval(montar,800);setTimeout(montar,1000);
})();
