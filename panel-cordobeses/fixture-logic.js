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

  return { clavePartido, rondasTodosContraTodos, partidosDeZona };
});


(function(root){
  if(!root||typeof root.fetch!=="function"||!root.location)return;
  const original=root.fetch.bind(root),colas={};
  root.fetch=function(input,options){
    const url=typeof input==="string"?input:(input&&input.url)||"";
    const metodo=((options&&options.method)||"GET").toUpperCase();
    const m=url.match(/^(.*\/panelCordobeses\/jornadas\/([^/]+)\/resultados)\/([^/]+)\/(gl|gv)\.json(\?[^#]*)?$/);
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
