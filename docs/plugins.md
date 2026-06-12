# Руководство по разработке плагинов для Nevo

**Nevo** поддерживает расширение возможностей редактора и рабочего пространства с помощью системы плагинов. Плагины загружаются динамически в runtime для каждого конкретного воркспейса и интегрируются с ProseMirror-редактором.

---

## 📁 Структура плагина

Все плагины воркспейса располагаются в его внутренней директории `.nevo/plugins/`. Каждый плагин должен находиться в своей собственной папке, имя которой совпадает с идентификатором плагина (`id`).

```text
<workspace_path>/
├── .nevo/
│   ├── plugins/
│   │   └── my-plugin/
│   │       ├── manifest.json
│   │       └── index.js
```

Для работы плагина необходимы как минимум два файла:
1. `manifest.json` — конфигурационный файл с метаданными.
2. Файл точки входа (например, `index.js`), указанный в манифесте.

---

## 📄 Спецификация манифеста (`manifest.json`)

Манифест описывает основные свойства плагина, его зависимости и требуемые права доступа (capabilities).

### Пример `manifest.json`

```json
{
  "id": "my-custom-plugin",
  "name": "My Custom Plugin",
  "version": "1.0.0",
  "description": "Добавляет кастомные команды и элементы в слэш-меню",
  "enabled": true,
  "entryPoint": "index.js",
  "apiVersion": "1.0.0",
  "nevoVersionRange": "^1.0.0",
  "editorCapabilities": [
    "editor.read",
    "editor.write"
  ],
  "priority": 10
}
```

### Описание полей манифеста

| Поле | Тип | Обязательное | Описание |
| --- | --- | --- | --- |
| `id` | `string` | Да | Уникальный идентификатор плагина. Разрешены только символы `[A-Za-z0-9._-]`. Должен в точности совпадать с именем папки плагина. |
| `name` | `string` | Да | Отображаемое имя плагина в настройках. |
| `version` | `string` | Да | Семантическая версия плагина (например, `"1.0.0"`). |
| `description` | `string` | Нет | Краткое описание плагина. |
| `enabled` | `boolean` | Да | Состояние включения плагина по умолчанию. |
| `entryPoint` | `string` | Да | Путь к основному JS-файлу плагина относительно папки плагина. |
| `apiVersion` | `string` | Да | Версия Nevo SDK API, под которую написан плагин (по умолчанию `"1.0.0"`). Мажорная версия должна совпадать с текущей версией SDK приложения. |
| `nevoVersionRange` | `string` | Нет | Совместимый диапазон версий Nevo (например, `^1.0.0`, `*` или `latest`). |
| `editorCapabilities` | `string[]` | Да | Массив запрашиваемых разрешений для доступа к API. |
| `priority` | `number` | Нет | Приоритет загрузки. Плагины с более высоким приоритетом инициализируются раньше, а их горячие клавиши перехватывают события первыми. |

---

## 🔒 Разрешения и возможности (Capabilities)

Система безопасности Nevo требует явного указания возможностей, которые использует плагин:

*   **`editor.read`**: Разрешает чтение состояния редактора (например, подписку на транзакции).
*   **`editor.write`**: Разрешает изменять состояние редактора (регистрировать команды, клавиши, узлы, отметки, элементы слэш-меню и т.д.).
*   **`workspace.read`**: Доступ к чтению метаданных воркспейса (будет доступно в будущих версиях).
*   **`workspace.command.invoke`**: Доступ к вызову некоторых команд бэкенда Tauri.

---

## 🔄 Жизненный цикл плагина

Плагин представляет собой ES-модуль (ES Module). Приложение импортирует его динамически. Экспортировать плагин можно одним из трех способов:

1. **Default export** (рекомендуется):
   ```javascript
   export default {
     onRegister(ctx) { ... },
     onActivate(ctx) { ... }
   };
   ```
2. **Named export `plugin`**:
   ```javascript
   export const plugin = { ... };
   ```
3. **Named function `createPlugin`**:
   ```javascript
   export function createPlugin() {
     return { ... };
   }
   ```

### Методы жизненного цикла

Каждый метод принимает объект контекста `NevoEditorContext` (подробнее см. ниже).

*   **`onRegister(ctx: NevoEditorContext): void | Promise<void>`**  
    Вызывается при первичной регистрации плагина. Это идеальное место для регистрации расширений редактора (схем, команд, горячих клавиш и т.д.).
*   **`onActivate(ctx: NevoEditorContext): void | Promise<void>`**  
    Вызывается, когда плагин переходит в активное состояние (после того, как зарегистрированы все плагины).
*   **`onDeactivate(ctx: NevoEditorContext): void | Promise<void>`**  
    Вызывается, когда плагин отключается пользователем в настройках воркспейса или при переключении воркспейса. Здесь следует отменять временные подписки или сбрасывать состояние.
*   **`onDispose(ctx: NevoEditorContext): void | Promise<void>`**  
    Вызывается перед уничтожением хоста плагинов/редактора. Используется для очистки памяти.

---

## 🛠 API контекста (`NevoEditorContext`)

Объект `ctx`, передаваемый в методы жизненного цикла, предоставляет доступ к расширению редактора и инфраструктуре приложения.

> [!IMPORTANT]
> Для вызова методов регистрации узлов, команд и интерфейса требуется разрешение `editor.write` в манифесте.

### Свойства контекста

*   **`pluginId: string`** — идентификатор текущего плагина.
*   **`capabilities: Set<NevoEditorCapability>`** — набор одобренных разрешений плагина.

### Регистрация элементов ProseMirror

*   **`registerNode(name: string, spec: NodeSpec): void`**  
    Регистрирует новый тип узла (Node) в схеме ProseMirror.
*   **`registerMark(name: string, spec: MarkSpec): void`**  
    Регистрирует новый тип отметки (Mark/стиля текста) в схеме ProseMirror.
*   **`registerNodeView(nodeName: string, nodeView: NodeViewConstructor): void`**  
    Привязывает кастомный рендерер (`NodeView`) для узла с именем `nodeName`.

### Регистрация логики и клавиатурных сокращений

*   **`registerCommand(id: string, command: Command): void`**  
    Добавляет команду в глобальный реестр команд Nevo. Команда имеет стандартную сигнатуру ProseMirror:
    `type Command = (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => boolean`.
*   **`registerKeymap(priority: number, bindings: Record<string, Command>): void`**  
    Регистрирует комбинации клавиш. Комбинации задаются в формате `prosemirror-keymap` (например, `"Ctrl-Shift-h"` или `"Mod-b"`). Чем выше `priority`, тем раньше перехватывается нажатие.

### Интерфейс пользователя (UI)

*   **`registerSlashItem(item: NevoSlashItem): void`**  
    Добавляет элемент в быстрое всплывающее меню по клавише `/` (Slash-меню).
    ```typescript
    interface NevoSlashItem {
      id: string
      title: string
      category?: string // 'text' | 'lists' | 'code' | 'media' | 'layout'
      keywords?: string[]
      run: (ctx: { view: EditorView; state: EditorState; dispatch: (tr: Transaction) => void }) => void
    }
    ```
*   **`registerToolbarAction(action: NevoToolbarAction): void`**  
    Добавляет кнопку/действие в плавающую панель форматирования выделенного текста.
    ```typescript
    interface NevoToolbarAction {
      id: string
      title: string
      order?: number
      run: (ctx: { view: EditorView; state: EditorState; dispatch: (tr: Transaction) => void }) => void
    }
    ```
*   **`registerDecorationProvider(id: string, provider: (state: EditorState) => Decoration[] | DecorationSet): void`**  
    Регистрирует провайдер динамических декораций (выделения цветом, добавления виджетов, классов) на основе текущего состояния редактора.

### Кастомные блоки, поповеры и сериализация

*   **`registerNodePopover(nodeName: string, config: NevoNodePopoverConfig): void`**  
    Привязывает к узлу декларативный поповер редактирования. Nevo сам строит форму из описанных полей, позиционирует её и применяет значения к `attrs` узла — писать собственный Vue-компонент не нужно.
    ```typescript
    interface NevoNodePopoverField {
      key: string                 // ключ attr
      type?: 'text' | 'textarea' | 'select' | 'number' | 'checkbox' | 'color'
      label?: string
      placeholder?: string
      rows?: number               // для textarea
      options?: Array<{ value: string; label: string }> // для select
      min?: number; max?: number; step?: number          // для number
    }
    interface NevoNodePopoverConfig {
      title?: string
      fields: NevoNodePopoverField[]
      removable?: boolean         // показывать кнопку удаления (по умолчанию true)
      read?: (attrs) => Record<string, unknown>   // attrs -> значения полей
      apply?: (values) => Record<string, unknown> // значения полей -> патч attrs
    }
    ```
*   **`requestNodeEdit(view: EditorView, position: number, anchorRect?: DOMRect): void`**  
    Открывает зарегистрированный поповер для узла на позиции `position` (используется из своего `NodeView`).
*   **`registerNodeSerializer(nodeName: string, serializer: NevoNodeSerializer): void`**  
    Учит экспорт сериализовать узел в Markdown / HTML / Typst. Без этого кастомный узел теряется при экспорте.
    ```typescript
    interface NevoNodeSerializer {
      markdown?: (node, helpers: { serializeChildren }) => string
      html?: (node, helpers: { serializeChildren; escapeHtml }) => string
      typst?: (node, helpers: { serializeChildren }) => string
    }
    ```
*   **`registerNodeImporter(importer: NevoNodeImporter): void`**  
    Восстанавливает узел из fenced-блока Markdown с заданным языком (round-trip импорта).
    ```typescript
    interface NevoNodeImporter {
      fencedLang: string
      fromFenced: (code: string) => NevoSerializableNode | null
    }
    ```
*   **`registerBlockType(config: NevoBlockTypeConfig): void`** — **рекомендуемый путь.**  
    Регистрирует кастомный блок одним вызовом: узел схемы, рендеринг, поповер, сериализаторы, импортёр и пункт slash-меню. Внутри использует методы выше.
    ```typescript
    interface NevoBlockTypeConfig {
      name: string
      schema: NodeSpec
      render: (node, helpers: { requestEdit: (anchorRect?) => void }) => HTMLElement
      popover?: NevoNodePopoverConfig
      serialize?: NevoNodeSerializer
      importer?: NevoNodeImporter
      slashItem?: { id; title; category?; keywords?; defaultAttrs?: Record<string, unknown> }
    }
    ```

### События (`eventBus`)

Шина событий позволяет реагировать на действия в редакторе:

```typescript
interface NevoEditorEventBus {
  emit<K extends keyof NevoEditorEventMap>(event: K, payload: NevoEditorEventMap[K]): void
  on<K extends keyof NevoEditorEventMap>(event: K, listener: (payload: NevoEditorEventMap[K]) => void): () => void
}
```

Доступные события:
*   `transactionApplied`: `{ state: EditorState; transaction: Transaction }` — срабатывает при каждом обновлении содержимого редактора.
*   `pluginActivated`: `{ pluginId: string }`
*   `pluginDeactivated`: `{ pluginId: string }`

### Хранилище (`storage`)

Предоставляет простое изолированное хранилище данных плагина между перезапусками воркспейса (сохраняется в памяти сессии):

*   **`ctx.storage.get<T>(key: string): T | undefined`**
*   **`ctx.storage.set<T>(key: string, value: T): void`**
*   **`ctx.storage.delete(key: string): void`**

---

## 💡 Практические примеры

### Пример 1. Простой плагин форматирования текста (Добавление отметки `Highlight` и кнопки в тулбар)

Ниже представлен полноценный код плагина, который регистрирует стиль выделения текста фоном (отметку `<mark>`) и добавляет кнопку переключения этого стиля в плавающую панель инструментов.

```javascript
// index.js

// Вспомогательная команда ProseMirror для переключения отметки
function toggleMark(markType) {
  return function(state, dispatch) {
    const { $from, $to, empty } = state.selection;
    if (empty) return false;
    
    if (dispatch) {
      const hasMark = state.doc.rangeHasMark($from.pos, $to.pos, markType);
      const tr = state.tr;
      if (hasMark) {
        tr.removeMark($from.pos, $to.pos, markType);
      } else {
        tr.addMark($from.pos, $to.pos, markType.create());
      }
      dispatch(tr);
    }
    return true;
  };
}

export default {
  onRegister(ctx) {
    // 1. Регистрируем спецификацию отметки (MarkSpec)
    ctx.registerMark('highlight', {
      parseDOM: [{ tag: 'mark' }],
      toDOM() { return ['mark', { class: 'plugin-highlight' }, 0]; }
    });
  },

  onActivate(ctx) {
    // В момент активации схема скомпилирована, и мы можем получить доступ к типу отметки
    const highlightMarkType = ctx.eventBus.on('transactionApplied', () => {}); // placeholder, реальный тип получаем из состояния
  
    // Регистрируем команду переключения
    ctx.registerCommand('plugin.toggle_highlight', (state, dispatch) => {
      const highlight = state.schema.marks.highlight;
      if (!highlight) return false;
      return toggleMark(highlight)(state, dispatch);
    });

    // Привязываем горячую клавишу Ctrl+Shift+H
    ctx.registerKeymap(10, {
      'Ctrl-Shift-h': (state, dispatch) => {
        const command = toggleMark(state.schema.marks.highlight);
        return command(state, dispatch);
      }
    });

    // Регистрируем кнопку в плавающем тулбаре
    ctx.registerToolbarAction({
      id: 'plugin.highlight.toolbar',
      title: 'Выделить желтым',
      order: 100,
      run({ state, dispatch }) {
        const highlight = state.schema.marks.highlight;
        if (highlight) {
          toggleMark(highlight)(state, dispatch);
        }
      }
    });
    
    // Добавляем команду в слэш-меню
    ctx.registerSlashItem({
      id: 'plugin.highlight.slash',
      title: 'Маркер (Выделение)',
      category: 'text',
      keywords: ['marker', 'highlight', 'маркер', 'выделить'],
      run({ state, dispatch }) {
        const highlight = state.schema.marks.highlight;
        if (highlight) {
          toggleMark(highlight)(state, dispatch);
        }
      }
    });
  }
};
```

Для стилизации выделения плагин может использовать стили, определенные в файле `style.css` плагина (при условии их импорта или сборки) либо использовать встроенные системные классы.

### Пример 2. Логирование изменений и подсчет слов

Этот плагин использует `eventBus` для прослушивания транзакций редактора и подсчета слов в документе, выводя информацию в консоль при каждом изменении.

```javascript
// index.js
export default {
  onActivate(ctx) {
    console.log(`Плагин ${ctx.pluginId} успешно активирован!`);
    
    // Подписываемся на транзакции редактора
    this.unsubscribe = ctx.eventBus.on('transactionApplied', ({ state, transaction }) => {
      // Реагируем только на фактическое изменение документа
      if (!transaction.docChanged) return;
      
      let textContent = '';
      state.doc.descendants((node) => {
        if (node.isText) {
          textContent += node.text + ' ';
        }
      });
      
      const words = textContent.trim().split(/\s+/).filter(Boolean);
      console.log(`[Plugin: WordCounter] Всего слов в документе: ${words.length}`);
    });
  },

  onDeactivate(ctx) {
    // Обязательно отписываемся от событий при отключении плагина
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    console.log(`Плагин ${ctx.pluginId} деактивирован.`);
  }
};
```

---

## 🧱 Пример: кастомный блок одним вызовом

`registerBlockType` решает сразу всё: добавляет узел, рисует его, даёт поповер редактирования и сохраняет блок при экспорте/импорте.

```javascript
// index.js
export default {
  onRegister(ctx) {
    ctx.registerBlockType({
      name: 'callout_card',
      schema: {
        group: 'block',
        atom: true,
        attrs: { title: { default: '' }, tone: { default: 'info' }, body: { default: '' } },
      },
      // Отрисовка содержимого блока. Клик откроет поповер автоматически.
      render: (node) => {
        const el = document.createElement('div');
        el.className = `callout-card tone-${node.attrs.tone}`;
        el.innerHTML = `<strong>${node.attrs.title}</strong><p>${node.attrs.body}</p>`;
        return el;
      },
      // Декларативный поповер — форму строит сам Nevo.
      popover: {
        title: 'Карточка',
        fields: [
          { key: 'title', type: 'text', label: 'Заголовок' },
          { key: 'tone', type: 'select', label: 'Тон', options: [
            { value: 'info', label: 'Инфо' },
            { value: 'warn', label: 'Предупреждение' },
          ] },
          { key: 'body', type: 'textarea', label: 'Текст', rows: 4 },
        ],
      },
      // Экспорт во все форматы.
      serialize: {
        markdown: (node) => `> [!${node.attrs.tone}] ${node.attrs.title}\n> ${node.attrs.body}`,
        html: (node, { escapeHtml }) => `<aside class="card">${escapeHtml(node.attrs.body)}</aside>`,
        typst: (node) => `#callout[${node.attrs.body}]`,
      },
      // Импорт обратно из Markdown: ```card ... ```
      importer: {
        fencedLang: 'card',
        fromFenced: (code) => ({ type: 'callout_card', attrs: { body: code, title: '', tone: 'info' } }),
      },
      slashItem: { id: 'callout-card.insert', title: 'Карточка', category: 'layout', defaultAttrs: { tone: 'info' } },
    });
  },
};
```

---

## 📦 Сборка и сборщики (Bundling)

Так как плагины загружаются приложением динамически прямо в браузере (через WebView), они должны представлять собой **валидные ES-модули без внешних bare-импортов** (таких как `import { Plugin } from 'prosemirror-state'`), которые веб-браузер не сможет разрешить автоматически.

Рекомендуется использовать сборщики (например, **esbuild**, **Rollup** или **Vite**):

1. **Если вы используете сторонние npm-пакеты:**  
   Скомпилируйте плагин в один самодостаточный JS-файл (bundle), упаковав все зависимости внутрь вашего файла.
2. **Если вы хотите импортировать ProseMirror-библиотеки:**  
   Поскольку Nevo не предоставляет глобальных путей к ProseMirror, вы можете упаковать нужные вспомогательные функции прямо в бандл плагина, либо использовать plain-объекты для конфигураций (таких как `NodeSpec`, `MarkSpec`), так как NevoEditorContext принимает именно их, не требуя инстанцирования классов ProseMirror напрямую.

Пример сборки с помощью `esbuild`:
```bash
esbuild src/index.js --bundle --format=esm --outfile=.nevo/plugins/my-plugin/index.js
```
