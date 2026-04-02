export async function onRequest(context) {
  return Response.redirect(new URL("/crm", context.request.url), 302);
}
