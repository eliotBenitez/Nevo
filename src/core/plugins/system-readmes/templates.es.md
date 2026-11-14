Las plantillas permiten crear notas nuevas a partir de contenido inicial reutilizable e insertar el contenido de una plantilla en una nota que ya estás escribiendo.

## Uso

- Con el plugin activado, al crear una nota se usa tu plantilla predeterminada. Elígela en los ajustes, en **Plantilla de nota nueva**. Si la plantilla tiene campos, un selector te pide rellenarlos antes.
- Para insertar una plantilla en la nota actual, escribe `/` y elige **Insertar plantilla**.
- En el selector puedes buscar plantillas, crear una **Nueva plantilla**, **duplicar** o **eliminar** las tuyas.

## Escribir plantillas

- Una plantilla tiene nombre, identificador, icono, descripción, contenido y campos opcionales (texto, multilínea, fecha, selección, casilla; cada uno puede ser obligatorio).
- El contenido admite marcadores: `{{date}}`, `{{time}}`, `{{datetime}}`, `{{note.title}}`, `{{workspace.name}}`, `{{field.id}}` para un campo personalizado y `{{cursor}}` para colocar el cursor tras la inserción.

## Notas

- Las plantillas integradas no se pueden editar ni eliminar; usa **Duplicar para editar** para crear tu propia copia.
- Al desactivar el plugin, las notas nuevas empiezan en blanco y se oculta el comando **Insertar plantilla**; tus plantillas se conservan.
