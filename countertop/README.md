# Counterform for Expo Go

Use your iPhone camera to capture countertop reference photos, save photo projects, and export a rectangular 3D slab based on measurements you enter. **No Apple Developer account, EAS build, or device registration is needed.**

This version does not use LiDAR or automatically reconstruct geometry from photos. The OBJ is a dimension-based rectangular model, with no sink cutouts, L-shape, or photo textures. Photos are saved separately for reference or later processing in another tool.

## Run on your iPhone

Install or update **Expo Go** from the App Store. In PowerShell:

```powershell
cd C:\Users\jeorg\OneDrive\Desktop\Project0069\countertop
npm install
npm start
```

Connect your computer and phone to the same Wi-Fi. Scan the terminal QR code with the iPhone Camera app, then open it in Expo Go. Allow local network and camera access when asked. Keep the terminal running while you use the app.

If the Wi-Fi connection fails:

```powershell
npx expo start --go --tunnel
```

This project targets **Expo SDK 57**, matching the App Store Expo Go release at the time of this setup. SDK 58 was available as a project dependency before its matching Expo Go release reached the App Store. Updating Expo Go alone cannot resolve that mismatch.

After pulling dependency changes, stop the old Metro server with Ctrl+C, run `npm install`, and start a fresh server:

```powershell
npx expo start --go --tunnel --clear
```

Scan the new QR code rather than opening an old recent-project link. If a mismatch remains, compare the project's SDK with the SDK listed in Expo Go's settings/about screen. Tunnel mode may ask to install Expo's tunnel helper.

## Use the app

1. Measure width, depth, and thickness in centimeters. Enter them and create a project.
2. Drag the slab preview horizontally to rotate it. Export the OBJ using the share sheet and choose Save to Files. OBJ units are **meters**, Y up; measurements come only from your input.
3. Open the camera and capture overlapping reference photos. The guide suggests different viewpoints. Aim for 20–40 varied photos, but the count is not a measure of reconstruction quality.
4. Tap Done to review the photos. Tap a thumbnail to share that JPEG or save it to Files. Photos are shared individually and are not embedded in the OBJ.
5. Return to All projects to open previous work. A project with zero photos can still be used for a manual slab model.
6. Press and hold a photo thumbnail to delete it. Use Delete project at the bottom of a project to remove it and all its photos from the phone.

Decimals can use a dot or a comma (`3.5` or `3,5`). Values that look like thousands separators, such as `1,000` or `1.000`, are rejected because they are ambiguous. Type `1000` instead. If a saved project file is damaged, the app skips it and loads the rest.

Projects and photos are stored within this project's Expo Go storage and remain between normal app launches. Clearing Expo Go's data, removing Expo Go, or changing project identity may make them unavailable. Export important files. No photos are uploaded by the app.

If camera access was denied, tap Open camera again and use the Settings option to allow camera access for Expo Go. Camera capture pauses when the app goes into the background. Web camera/storage is not the supported workflow; use your physical iPhone.

## Run the website

```powershell
cd C:\Users\jeorg\OneDrive\Desktop\Project0069\countertop
npx expo start --web
```

Open http://localhost:8081. The website has the same features as the phone app. Projects and photos are stored in the browser's IndexedDB, and nothing is uploaded. The OBJ and photos download as files instead of opening a share sheet. Camera capture needs a webcam and works on `localhost` or HTTPS only. Projects are saved per browser and per device: clearing site data or using a private window removes them.

For a static build you can host anywhere: `npx expo export --platform web` writes the site to `dist/`.

## Checks

```powershell
npm run typecheck
npm run lint
npx expo config --type public
npx expo export --platform ios
```

Check on a real iPhone: camera permission denial and recovery, multiple captures, Done and reopening the camera, returning from the background, project persistence after reopening Expo Go, model rotation, JPEG sharing, and OBJ import into a design tool at meter scale. A successful JavaScript export does not verify physical camera behavior.

The earlier custom LiDAR source remains in `modules/countertop-scanner` for future native development, but the Expo Go app does not import or invoke it. The old custom-build guide is preserved in [NATIVE_SCANNER.md](NATIVE_SCANNER.md); its Apple signing requirements apply only to that earlier workflow.

References: [Expo Camera](https://docs.expo.dev/versions/v57.0.0/sdk/camera/), [Expo project storage](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem-legacy/), [Expo Sharing](https://docs.expo.dev/versions/v57.0.0/sdk/sharing/), [Expo Go and project SDK compatibility](https://docs.expo.dev/get-started/create-a-project/).
