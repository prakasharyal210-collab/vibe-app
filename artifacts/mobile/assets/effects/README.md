# DeepAR Effect Files

Place `.deepar` effect bundles here. They are copied into the native Android/iOS
asset directories automatically during `expo prebuild`.

## How to download free effects

1. Log in to https://developer.deepar.ai
2. Go to **Effect gallery** → download free effects as `.deepar` files
3. Drop them into this folder with these exact filenames:

| Filename                  | Lens name in app  |
|---------------------------|-------------------|
| `aviators.deepar`         | Aviators          |
| `flower_crown.deepar`     | Flower Crown      |
| `neon_devil_horns.deepar` | Neon Devil Horns  |

Add any additional `.deepar` files here and update `LensData.ts` with their paths.

## Path format in LensData.ts

- **Android:** `file:///android_asset/effects/<filename>.deepar`
- **iOS:** resolved at runtime via `RNFS.MainBundlePath + '/effects/<filename>.deepar'`
  (or use the `Platform.select` helper in `LensData.ts`)
