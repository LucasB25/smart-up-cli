# 🚀 Smart-Up CLI

> A smart, interactive, and safe NPM dependency updater.

[![npm version](https://img.shields.io/npm/v/smart-up-cli?style=flat-square)](https://www.npmjs.com/package/smart-up-cli)

**Smart-Up** helps you update your `package.json` dependencies without breaking your application. It analyzes semantic versioning risks and lets you choose updates interactively.

---

## ✨ Features

* **🛡️ Safety First:** Automatically unchecks **Major** updates (breaking changes) by default.
* **🎨 Visual Feedback:** Color-coded diffs based on SemVer:
    * 🟢 **Green:** Patch (Bug fixes, safe).
    * 🟡 **Yellow:** Minor (New features, usually safe).
    * 🔴 **Red:** Major (Breaking changes, risky).
* **🧠 Intelligent Parsing:** Handles complex version ranges (e.g., `^1.2.0`, `~2.4.0`) correctly.
* **⚡ All-in-One:** Updates `package.json` and runs `npm install` automatically.

## 📦 Installation

Install it globally to use it in any project:

```bash
npm install -g smart-up-cli
```

## 🚀 Usage

Navigate to your project folder (where your package.json is located) and run:

```bash
smart-up
```

Or run it without installing via npx:

```bash
npx smart-up-cli
```

## ⚙️ How it works

3. Analyzes: It checks your current installed versions against the latest on NPM.

2. Classifies: It calculates the risk based on Semantic Versioning.

3. Prompts: You select which packages to update using the Space bar.

4. Executes: It updates the version in package.json and runs npm install.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the project.

2. Create your feature branch (git checkout -b feature/AmazingFeature).

3. Commit your changes (git commit -m 'Add some AmazingFeature').

4. Push to the branch (git push origin feature/AmazingFeature).

5. Open a Pull Request.