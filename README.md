<p align="center">
  <img src="public/logo.png" width="120" alt="Nevo Logo">
</p>

<h1 align="center">Nevo</h1>

<p align="center">
  <strong>Премиальное рабочее пространство для знаний нового поколения</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2-FFC131?logo=tauri&logoColor=white" alt="Tauri">
  <img src="https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js&logoColor=white" alt="Vue 3">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License">
</p>

---

**Nevo** — это минималистичное, десктопное приложение для организации знаний, вдохновленное Notion, Obsidian и SiYuan. Мы создаем пространство, где высокая производительность сочетается с элегантным визуальным стилем Glassmorphism.

## ✨ Особенности

- 🔒 **Local-first**: Ваши данные принадлежат только вам. Все хранится локально на вашем устройстве.
- ✍️ **WYSIWYG Редактор**: Мощный редактор на базе ProseMirror с поддержкой Markdown "на лету".
- ✨ **Glassmorphism Дизайн**: Современный, полупрозрачный интерфейс с мягким размытием и акцентом на контент.
- ⌨️ **Keyboard-first**: Оптимизировано для быстрой работы без мыши через горячие клавиши и слэш-команды.
- 🚀 **Производительность**: Невероятно быстрый запуск и работа благодаря Tauri и Vue 3.

## 📸 Скриншоты

<table align="center">
  <tr>
    <td><img src="settings/Screen Shot 2026-05-15 at 00.33.36.png" width="400"></td>
    <td><img src="settings/Screen Shot 2026-05-15 at 00.33.38.png" width="400"></td>
  </tr>
  <tr>
    <td><img src="settings/Screen Shot 2026-05-15 at 00.33.45.png" width="400"></td>
    <td><img src="settings/Screen Shot 2026-05-15 at 00.33.49.png" width="400"></td>
  </tr>
  <tr>
    <td><img src="settings/Screen Shot 2026-05-15 at 00.33.54.png" width="400"></td>
    <td><img src="settings/Screen Shot 2026-05-15 at 00.34.02.png" width="400"></td>
  </tr>
</table>

## 🛠 Технологический стек

- **Backend:** [Tauri](https://tauri.app/) (Rust)
- **Frontend:** [Vue 3](https://vuejs.org/) (Composition API)
- **Язык:** [TypeScript](https://www.typescriptlang.org/)
- **Стилизация:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Редактор:** [ProseMirror](https://prosemirror.net/)
- **Стейт-менеджер:** [Pinia](https://pinia.vuejs.org/)
- **Сборка:** [Vite](https://vitejs.dev/)

## 🚀 Быстрый старт

### Требования
- Node.js (рекомендуется v20+)
- [pnpm](https://pnpm.io/)
- Rust (и зависимости для разработки Tauri)

### Установка
1. Клонируйте репозиторий:
   ```bash
   git clone https://github.com/your-username/nevo.git
   cd nevo
   ```

2. Установите зависимости:
   ```bash
   pnpm install
   ```

3. Запустите в режиме разработки:
   ```bash
   pnpm tauri dev
   ```

## 🏗 Архитектура

Проект следует строгим архитектурным принципам для обеспечения поддерживаемости:

- `src/app/`: Основная оболочка приложения и макеты.
- `src/editor-core/`: Изолированная логика ProseMirror (схемы, плагины, команды).
- `src/features/`: Модульные реализации функций (графы, базы данных, онбординг).
- `src/ui/`: Многоразовые примитивы интерфейса и анимации.
- `src-tauri/`: Исходный код Rust для десктопного бэкенда.

**Важно:** Состояние редактора ProseMirror строго изолировано от Vue/Pinia для предотвращения проблем с производительностью и реактивностью.

## 📄 Лицензия

Этот проект распространяется под лицензией MIT. Подробности в файле [LICENSE](LICENSE).
