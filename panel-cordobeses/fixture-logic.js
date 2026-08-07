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
