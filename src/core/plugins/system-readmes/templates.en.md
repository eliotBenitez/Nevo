Templates let you create new notes from reusable starting content and insert template content into a note you are already writing.

## Usage

- When the plugin is enabled, creating a note uses your default template. Choose it in Settings, under **New note template**. If the template has fields, a picker asks you to fill them in first.
- To insert a template into the current note, type `/` and pick **Insert Template**.
- In the picker you can search templates, create a **New template**, **Duplicate** or **Delete** your own ones.

## Writing templates

- A template has a name, identifier, icon, description, content and optional fields (text, multiline, date, select, checkbox; each can be required).
- Content can use placeholders: `{{date}}`, `{{time}}`, `{{datetime}}`, `{{note.title}}`, `{{workspace.name}}`, `{{field.id}}` for a custom field, and `{{cursor}}` to place the cursor after insertion.

## Notes

- Built-in templates cannot be edited or deleted; use **Duplicate to edit** to make your own copy.
- Disabling the plugin makes new notes start blank and hides the **Insert Template** command; your templates are kept.
