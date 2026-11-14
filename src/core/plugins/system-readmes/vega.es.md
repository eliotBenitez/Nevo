Los gráficos Vega-Lite convierten una especificación JSON en un gráfico interactivo dentro de tu nota.

## Uso

- Escribe `/` en una línea vacía y elige **Gráfico** para insertar un bloque de gráfico.
- Haz clic en el bloque para abrir su editor, pega o escribe una especificación Vega-Lite (JSON) y elige **Aplicar**. **Eliminar** quita el bloque.
- Una especificación típica define `mark`, datos en `data.values` y un `encoding`:

```json
{
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "mark": "bar",
  "data": { "values": [{ "a": "A", "b": 28 }] },
  "encoding": { "x": { "field": "a" }, "y": { "field": "b" } }
}
```

## Notas

- El gráfico sigue el tema de la aplicación y cambia entre colores claros y oscuros.
- Si la especificación no es válida, el bloque muestra un error en lugar del gráfico; corrige el JSON para recuperarlo.
- Las especificaciones muy grandes (más de 100 000 caracteres) no se renderizan, para mantener la aplicación fluida.
- Desactivar el plugin oculta el comando de inserción y el renderizado del bloque; la especificación sigue guardada en la nota.
