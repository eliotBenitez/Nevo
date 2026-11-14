Vega-Lite charts turn a JSON specification into an interactive chart that lives inside your note.

## Usage

- Type `/` on an empty line and choose **Chart** to insert a chart block.
- Click the block to open its editor, paste or write a Vega-Lite specification (JSON), then choose **Apply**. Use **Delete** to remove the block.
- A typical specification sets `mark`, inline `data.values` and an `encoding`:

```json
{
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "mark": "bar",
  "data": { "values": [{ "a": "A", "b": 28 }] },
  "encoding": { "x": { "field": "a" }, "y": { "field": "b" } }
}
```

## Notes

- The chart follows the app theme and switches between light and dark colors.
- If the specification is invalid, the block shows an error instead of a chart; fix the JSON to bring it back.
- Very large specifications (over 100,000 characters) are not rendered, to keep the app responsive.
- Disabling the plugin hides the chart command and block rendering; the specification stays saved in the note.
