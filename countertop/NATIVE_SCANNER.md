# Counterform

A custom Expo iPhone app for real ARKit LiDAR mesh capture of a kitchen countertop. This does **not** run in Expo Go. No server or upload service is used.

## What is implemented

- Native ARKit scene reconstruction with live cropped wireframe.
- Tap to select the countertop center. The capture box aligns to your camera's horizontal heading at selection time.
- Adjustable width, depth, and vertical band in centimeters. These are crop bounds, not measurements inferred from the scan.
- Persistent local scans, rotatable SceneKit preview, and iOS share sheet for OBJ export.
- OBJ coordinates in **meters**, Y up, relative to your selected surface center. Triangles are unwelded; no textures or normals are exported.
- Permission denial, unsupported devices, tracking loss, scan cancellation, and session interruptions are handled.

## Install on your iPhone from Windows

You need an Expo account and an Apple Developer Program membership for EAS device builds. Use a physical LiDAR-equipped iPhone; the app checks ARKit mesh support at runtime.

In PowerShell, from this folder:

```powershell
npm install
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest device:create
npx eas-cli@latest build --platform ios --profile preview
```

During configuration, link or create your Expo project, sign in to Apple when requested, and register this iPhone using the device registration link. Allow EAS to manage signing. The bundle identifier is `com.jeorg.counterform`; change it in `app.json` if your Apple account needs another identifier.

Open the finished build's installation link on the registered iPhone. The **preview** profile bundles JavaScript and runs without your computer or Metro. Enable Developer Mode under Settings → Privacy & Security if iOS requests it. This repository does not contain an already signed IPA or account credentials.

For a development build instead:

```powershell
npx eas-cli@latest build --platform ios --profile development
npx expo start --dev-client --lan
```

Install that build on the registered phone, connect phone and computer to the same Wi-Fi, then open the development server in the custom app. If your network blocks LAN discovery, use `npx expo start --dev-client --tunnel`. Swift changes require a new native build; TypeScript changes can reload through Metro.

On a Mac with Xcode, local device builds are also possible with `npx expo run:ios --device`.

## Capture

1. Clear the counter and use even light. Start with a region slightly larger than the counter. For an L-shaped counter, choose a bounding box that includes both legs.
2. Start scanning, move slowly until tracking settles, then tap the center of the counter surface. Width runs left/right from the view at that moment; depth runs forward/back. The yellow outline shows the crop box.
3. Move around the counter and view its edges from multiple angles. Stay roughly 0.4–2 meters away. Mint triangles show captured geometry inside the box. Reset to change placement.
4. Save, then use **View 3D** or **Share OBJ**. Save important objects to Files; uninstalling the app removes its local scans. Objects are also accessible through the app's Documents folder in Files.

## Accuracy and scope

This is a raw scene mesh, not automatic semantic extraction of only the countertop. Anything inside the crop box can be retained. Only triangles with all three vertices inside the box are exported, so crop boundaries may be ragged. The app does not infer missing surfaces, manufacture sink openings, produce a watertight solid, or add photo textures. Nearby wall/cabinet geometry can remain. Glossy, dark, transparent, or thin surfaces may scan poorly. ARKit may simplify or smooth geometry. Verify all critical dimensions independently; do not use the scan alone to fabricate stone or cabinetry.

## Validation

```powershell
npm run typecheck
npm run lint
npx expo config --type public
npx expo-modules-autolinking resolve --platform apple
npx expo export --platform ios
```

Native Swift compilation and end-to-end LiDAR operation require an EAS/Xcode build and a physical device. Windows cannot compile ARKit. Before relying on the app, check camera denial/recovery, cancel/reset, interruption recovery, a scan with visible countertop edges, persistence after relaunch, preview rotation, and opening the exported OBJ in Blender (meters). Confirm exported scale against a tape measure.

Validation performed on Windows: TypeScript, ESLint, Expo public config, discovery of `CountertopScannerModule` through Apple autolinking, and iOS Hermes JavaScript export. The SDK dependency check passed against Expo's bundled version map in offline mode. Native compilation and device capture have not yet been verified. Dependency installation also reported npm security advisories in the dependency tree; review `npm audit` before production distribution.

References: [Expo native modules](https://docs.expo.dev/modules/), [EAS iPhone builds](https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/), [Apple scene reconstruction](https://developer.apple.com/documentation/arkit/arworldtrackingconfiguration/scenereconstruction).
