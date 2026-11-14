La sincronización con GitHub hace una copia de seguridad de tu espacio de trabajo en un repositorio de GitHub. Es una subida en un solo sentido: Nevo nunca descarga ni fusiona cambios en tu espacio.

## Configuración

- Abre el plugin y elige **Configurar**; después rellena los ajustes siguientes.
- **Repositorio**: con el formato `owner/name`.
- **Rama**: la rama donde se guarda la copia (`main` si se deja vacío). Usa una rama o un repositorio dedicado.
- **Token de acceso**: un token de acceso personal con alcance `repo`. Se guarda en el almacenamiento seguro de tu sistema operativo, no en el espacio de trabajo.
- **Mensaje de commit**: el mensaje de cada commit de la copia (`Nevo backup` si se deja vacío).
- **Sincronización automática** e **Intervalo (minutos)**: subida periódica, de 1 minuto a 24 horas. La primera sincronización automática se ejecuta tras un intervalo completo.

## Uso

- Elige **Probar conexión** para comprobar el repositorio y el token.
- Elige **Sincronizar** para subir de inmediato. El estado muestra la hora de la última sincronización y el número de archivos.

## Qué se sube

- Notas, carpetas, recursos, tableros, bases de datos, plantillas e historial, como en una exportación del espacio. Los plugins instalados no se incluyen.
- Los archivos que ya son idénticos en el repositorio no se vuelven a subir.
- Los archivos de más de 25 MiB se omiten, y todo el espacio debe ocupar menos de 512 MiB.

## Notas

- La rama se sustituye por una copia del espacio de trabajo: los archivos que no están en el espacio se eliminan de la rama, pero se conserva el historial de commits.
- Solo puede ejecutarse una sincronización a la vez por espacio de trabajo.
