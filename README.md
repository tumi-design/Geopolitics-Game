# React + Vite

Dynamic server-side battle commentary is documented in
[GEMINI_COMMENTARY.md](./GEMINI_COMMENTARY.md), including exact PowerShell
instructions for the API + Vite setup, secure Firebase writer configuration,
real Gemini testing and future Vercel environment variables.

For this game's account, cloud-save and spectator setup, see
[FIREBASE_SETUP.md](./FIREBASE_SETUP.md). Production Firestore rules must be
deployed explicitly before using cloud saves with the real Firebase project.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
