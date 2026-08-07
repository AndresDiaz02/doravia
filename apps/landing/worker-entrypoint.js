export default {
  fetch(request, env) {
    const url = new URL(request.url);
    const paginas = {
      "/origen": "/origen.html",
      "/erp": "/erp.html",
      "/punto": "/punto.html",
      "/nomina": "/nomina.html",
      "/contadores": "/contadores.html",
      "/privacidad": "/privacidad.html",
      "/terminos": "/terminos.html",
    };

    if ((request.method === "GET" || request.method === "HEAD") && paginas[url.pathname]) {
      url.pathname = paginas[url.pathname];
      return env.ASSETS.fetch(new Request(url, request));
    }
    return env.ASSETS.fetch(request);
  },
};
