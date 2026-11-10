# Counterform

A small app for keeping countertop reference photos and exporting a simple 3D slab from measurements you enter. Built with Expo and React Native for iPhone and the web.

You can save projects, take photos, rotate the slab preview, and export an OBJ file. Everything stays on your device. The model uses your measurements; photos are reference material and do not generate geometry.

## Get started

```sh
git clone https://github.com/Pukaboys/Project0069.git
cd Project0069/countertop
npm install
npm start
```

Open the project in Expo Go on your iPhone. For the browser version, run `npm run web`.

See [the app guide](countertop/README.md) for setup, usage, exports, and limitations. The older native LiDAR experiment is documented in [the native scanner guide](countertop/NATIVE_SCANNER.md).

## Development

Run these from `countertop`:

```sh
npm run typecheck
npm run lint
```
